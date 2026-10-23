#!/usr/bin/env bash
# 御膳智控 ERP V2 · 打开服务端登录（登录后免预览站密码）的一次性权限设定
# 由负责人在 Google Cloud Shell 执行。负责人 2026-10-23 批准，
# 设计见 docs/security/2026-10-23-login-instead-of-gate-password.md。
#
# 只加权限，不建资料库、不改 Firestore Rules、不改 Firebase Auth 设定、不碰 V1：
#   1. 预览站的运行用服务账号可以签发登录凭证（Firebase Custom Token 需要 signBlob）
#   2. 运行用服务账号可以读写 Firestore（服务端比对 PIN、写 PIN 哈希与尝试次数）
#
# 用法（PROJECT_ID 填 erp-v2-dev 所在、也是 Firebase 所在的项目 ID）：
#   PROJECT_ID=<项目 ID> bash docs/deploy/enable-server-login.sh
set -euo pipefail

PROJECT_ID="${PROJECT_ID:?请先设置 PROJECT_ID，例如：PROJECT_ID=my-project bash enable-server-login.sh}"
REGION="${REGION:-asia-southeast1}"
RUNTIME_SA="erp-v2-dev-runtime@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud config set project "${PROJECT_ID}" >/dev/null

echo "==> 检查：这个项目有 erp-v2-dev 与 Firestore"
gcloud run services describe erp-v2-dev --region "${REGION}" >/dev/null || { echo "这个项目没有 erp-v2-dev，请确认 PROJECT_ID"; exit 1; }
gcloud firestore databases describe --database='(default)' >/dev/null 2>&1 || {
  echo "⚠️ 这个项目找不到 Firestore 资料库。"
  echo "   Firebase 如果在另一个项目，登录凭证必须由那个项目的服务账号签发，请先把这个讯息转告 Claude Code，不要继续。"
  exit 1
}

echo "==> 1/2 运行用服务账号可以签发登录凭证（只对自己）"
gcloud iam service-accounts add-iam-policy-binding "${RUNTIME_SA}" \
  --member "serviceAccount:${RUNTIME_SA}" --role roles/iam.serviceAccountTokenCreator >/dev/null

echo "==> 2/2 运行用服务账号可以读写 Firestore"
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member "serviceAccount:${RUNTIME_SA}" --role roles/datastore.user --condition=None >/dev/null

cat <<'EOF'

==================== 完成 ====================
下一步：
1. GitHub → 仓库 Settings → Secrets and variables → Actions → Variables
   新增变量  AUTH_SERVER_ENABLED = true
2. 重新部署预览站：GitHub → Actions → 「Deploy dev preview」→ 点最近一次（develop-v2 的 push）→
   右上角「Re-run all jobs」。（或等下一次合并自动部署。）
   部署成功后，dev / epr 两个网址打开就是登录页，不再问预览站密码。
3. 先用自己的账号试：输入员工编号 + PIN 登录 → 关掉浏览器再打开不问密码 → 登出后要重新登录。

回滚：把 GitHub 变量 AUTH_SERVER_ENABLED 删掉（或改成 false），重新部署 → 回到「先问预览站密码」。
EOF
