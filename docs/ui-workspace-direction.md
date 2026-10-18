# 新版工作台 UI 方向与协作边界

2026年10月18日。基准 develop-v2 790ecbff998e14e45368a4824889e90bf23c50df。

独立分支 codex/new-workspace-ui。CC 的 claude/v2-supplier-catalog-plan 只读查看，不写入。

第一稿以现有 BossDashboard 的功能名称、moduleNavigation 的分类生成离线交互预览：电脑侧栏、手机底部导航、可搜索功能目录、常用星标、模块入口层级。没有营业数字，不连接 Firebase。

实现时保持 canUseBossTarget、canOpenDataTools 等权限判断与现有业务回调；不修改供应商、库存、财务、API 或 Firebase 配置。应用级改动另经完整检查与 PR 审核后才能进入 develop-v2。当前仅设计稿，未部署开发站。

版本展示使用“经营工作台”，不擅自把程序版本号改为3.0。
