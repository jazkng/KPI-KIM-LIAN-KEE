#!/usr/bin/env bash
# 御膳智控 ERP V2 · 正式站一次性设置（由负责人在 Google Cloud Shell 执行）
# 负责人 2026-10-23 决定：dev 是测试站，确认后发布到 epr；epr 是正式站。
#
# 前提：预览站已经按 setup-dev-preview.sh 设置好（镜像仓库、两个服务账号、GitHub 登录设定都沿用）。
# 只新增资源，不修改也不删除任何现有资源：
#   - 不碰两个 V1 AI Studio 部署、不碰预览站 erp-v2-dev、不碰其他 Cloud Run 服务
#   - 不碰 Firestore 数据库与 Security Rules，不新建数据库
#
# 用法：
#   PROJECT_ID=<Firebase/GCP 项目 ID> bash docs/deploy/setup-production.sh
#
# 可以重复执行：已存在的资源会跳过。
set -euo pipefail

PROJECT_ID="${PROJECT_ID:?请先设置 PROJECT_ID，例如：PROJECT_ID=my-project bash setup-production.sh}"
REGION="${REGION:-asia-southeast1}"
SERVICE="erp-v2"
DOMAIN="epr.kimliankee.app"
RUNTIME_SA="erp-v2-dev-runtime@${PROJECT_ID}.iam.gserviceaccount.com"
DEPLOY_SA="erp-v2-dev-deployer@${PROJECT_ID}.iam.gserviceaccount.com"

step() { echo; echo "==> $*"; }
exists() { "$@" >/dev/null 2>&1; }

gcloud config set project "${PROJECT_ID}" >/dev/null
exists gcloud iam service-accounts describe "${RUNTIME_SA}" || { echo "找不到 ${RUNTIME_SA}，请先执行 setup-dev-preview.sh"; exit 1; }

step "1/4 正式站访问密码（Secret Manager；只显示一次）"
if exists gcloud secrets describe erp-v2-prod-access-password; then
  echo "  erp-v2-prod-access-password 已存在，跳过（如需更换：gcloud secrets versions add erp-v2-prod-access-password --data-file=-）"
else
  PROD_PW="$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-20)"
  printf '%s' "${PROD_PW}" | gcloud secrets create erp-v2-prod-access-password --data-file=- --replication-policy=automatic
  echo
  echo "  ┌──────────────────────────────────────────────────────────────┐"
  echo "  │ 正式站密码（只显示这一次，请立即存入密码管理器）：            │"
  echo "  │   ${PROD_PW}"
  echo "  │ 员工第一次打开时浏览器会问帐号和密码：帐号随意，密码填这串。  │"
  echo "  └──────────────────────────────────────────────────────────────┘"
  unset PROD_PW
fi
gcloud secrets add-iam-policy-binding erp-v2-prod-access-password --member "serviceAccount:${RUNTIME_SA}" \
  --role roles/secretmanager.secretAccessor >/dev/null

step "2/4 建立 Cloud Run 服务 ${SERVICE}（先放占位容器，之后由 GitHub Actions 发布）"
if ! exists gcloud run services describe "${SERVICE}" --region "${REGION}"; then
  gcloud run deploy "${SERVICE}" --image us-docker.pkg.dev/cloudrun/container/hello \
    --region "${REGION}" --service-account "${RUNTIME_SA}" --no-allow-unauthenticated --quiet
fi
# 访问控制由服务端的访问门禁负责（PREVIEW_ACCESS_PASSWORD），Cloud Run 本身开放访问
gcloud run services add-iam-policy-binding "${SERVICE}" --region "${REGION}" \
  --member allUsers --role roles/run.invoker >/dev/null

step "3/4 部署账号的权限（只加 ${SERVICE} 这一个服务；读取预览站目前版本用 run.viewer）"
gcloud run services add-iam-policy-binding "${SERVICE}" --region "${REGION}" \
  --member "serviceAccount:${DEPLOY_SA}" --role roles/run.developer >/dev/null
gcloud run services add-iam-policy-binding erp-v2-dev --region "${REGION}" \
  --member "serviceAccount:${DEPLOY_SA}" --role roles/run.viewer >/dev/null

step "4/4 自定义网域 ${DOMAIN}"
if gcloud beta run domain-mappings describe --domain "${DOMAIN}" --region "${REGION}" >/dev/null 2>&1; then
  MAPPED_TO="$(gcloud beta run domain-mappings describe --domain "${DOMAIN}" --region "${REGION}" --format='value(spec.routeName)')"
  if [ "${MAPPED_TO}" != "${SERVICE}" ]; then
    echo "  ${DOMAIN} 目前指向 ${MAPPED_TO}（测试站），这一步先不动，员工照常使用。"
    echo "  等正式站第一次发布成功后，在店休时执行 docs/deploy/move-epr-to-production.sh 把网址搬过来。"
  else
    echo "  网域映射已存在。"
  fi
else
  gcloud beta run domain-mappings create --service "${SERVICE}" --domain "${DOMAIN}" --region "${REGION}" || \
    echo "  ⚠️ 网域映射未成功。请把错误讯息转告 Claude Code。"
fi
echo "  需要在 Cloudflare 添加的 DNS 记录："
gcloud beta run domain-mappings describe --domain "${DOMAIN}" --region "${REGION}" \
  --format="table(status.resourceRecords[].type, status.resourceRecords[].name, status.resourceRecords[].rrdata)" 2>/dev/null || true
echo "  ⚠️ Cloudflare 中这条记录必须设为「DNS only（灰色云）」，否则 Google 无法签发 HTTPS 证书。"
echo "  ⚠️ 如果 epr 目前已有记录（例如指向旧系统），改之前先截图保存，回滚时要用。"

cat <<EOF

==================== 完成 ====================
下一步：
  gh workflow run deploy-production.yml -R jazkng/KPI-KIM-LIAN-KEE --ref develop-v2 -f action=release
EOF
