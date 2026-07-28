# 御膳智控 ERP — 风格统一 + 代码清理 版本

对应 GitHub `main` 分支 commit `841c1f8`。

---

## 一、这个压缩包是什么

整个项目的**完整源码**（已排除 `node_modules`、`dist`、`.git`）。
解压后直接覆盖 AI Studio 里对应的文件即可。

---

## 二、⚠️ 覆盖之后，还要手动删掉这 26 个文件

压缩包只能"覆盖"，没法"删除"。下面这些文件在新版本里已经删掉了，
你在 AI Studio 里要手动删一遍，否则它们会留在项目里。

**留着不删也不会报错**（它们已经没有任何地方引用了），
只是白占地方、以后容易看混。有空再删也行。

### 一次性脚本 / 临时文件（17 个，删了最干净）

    add_english_to_all.js
    build_full_staff_ts.js
    build_staff_translations.js
    builder.cjs
    check_translations.ts
    generate_final_staff_translations.js
    generate_staff_ts.js
    generated_translations.txt      ← 143KB，最占地方的一个
    merge_and_update_staff_translations.js
    patch_inventory.sh
    populate_all_translations.js
    rebuild_staff_translations_clean.cjs
    run_full_translation_update.js
    temp.txt
    test_cases.ts
    test_cases_part2.ts
    test_mymemory.cjs

### 没有任何地方引用的源码文件（9 个）

    components/KPIUtils.ts
    components/StaffViews.tsx
    components/features/AccountsPayableModule.tsx        ← 只是个转发壳
    components/features/AttendanceModule.tsx
    components/features/PriceHistoryMigrationTool.tsx
    components/features/roster/RosterAnomalyPanel.tsx
    components/features/treasury/components/TreasuryDialog.tsx
    components/features/treasury/components/TreasuryStatusBadge.tsx
    utils/i18n.ts

---

## 三、这次改了什么

### 风格统一

1. **手机 / 电脑断点统一为 768px**
   以前 `FinancialReport` 等模块在 640px 切换布局、`AccountsPayable` 等在
   768px 切换，导致 640–767px（平板竖屏）这段宽度里，有的页面已经是电脑版、
   有的还是手机版。现在全站统一在 768px 切换。共改动 1204 处。

2. **新增 `utils/useIsMobile.ts`**
   JS 判断手机/电脑的唯一标准。以前 `RosterModule`、`MenuManagement`、
   `LanguageSelector` 各写各的，现在统一调用这个。

3. **配色收敛**
   | 旧 | 处数 | 新 |
   |---|---|---|
   | `#FFD700` | 550 | `#FFD200`（品牌金） |
   | `#1A1A1A` / `#171717` | 656 | `#111111`（墨黑） |
   | `#F5F7FA` / `#F8F9FA` / `#F9FAFB` | 59 | `#F6F7FB`（页面底色） |
   | `#E5BD00` / `#EBC200` | 2 | `#E5C100`（金色 hover） |

   色板写在 `styles.css` 开头的注释里，以后照着用就不会再分叉。

4. **修正 275 处失效的 Tailwind 色阶**（这是真实缺陷，不只是好看问题）
   像 `border-gray-150`、`text-stone-450` 这种色阶在 Tailwind 里根本不存在，
   不会生成任何 CSS。而 Tailwind v4 的边框默认色是 `currentColor`，
   所以这些边框实际上是跟着文字颜色走的深色边框，不是想要的浅灰。

5. **`index.html` 精简**
   内联样式只留首屏防闪必需的部分（其余和 `styles.css` 重复）；
   删掉失效的 CDN importmap（Vite 会重写 import，它从未生效）。

### 代码清理

- 删除上面列的 26 个文件
- 删除 `HRPayroll.tsx` 里约 1100 行考勤导入死代码
  （该功能已在 `AttendanceConsole.tsx` 实现并接好了按钮和弹窗，
   HRPayroll 里那份没有任何 UI 入口，界面上点不进去）
- 清理 311 处未使用的 import、105 处未使用的声明
- `tsconfig.json` 开启 `noUnusedLocals`，防止以后再堆积

**净减 8000 行。`tsc --noEmit` 和 `vite build` 都通过。**

---

## 四、覆盖后建议检查

1. 把浏览器窗口横向拉到 **700px** 左右（平板竖屏宽度），扫一遍主要页面
   —— 这次断点统一影响最大的就是这个区间
2. 整体金色和黑色的观感有没有哪里别扭
3. 常用流程走一遍：每日结算、考勤、库存盘点

**打卡机导入功能没有受影响**，它在 `AttendanceConsole.tsx` 里，这次没动业务逻辑。

---

## 五、出问题怎么退回

GitHub 上旧版本完整保留在 commit `9234e1e`。
需要的话跟我说，我可以打包一份旧版给你，或者把 `main` 回退过去。
