#!/usr/bin/env bash
# 御膳智控 ERP V2 · 预览站一次性设置（由负责人在 Google Cloud Shell 执行）
#
# 只新增资源，不修改也不删除任何现有资源：
#   - 不碰两个 V1 AI Studio 部署、不碰现有 Cloud Run 服务（ap-ai-service 等）
#   - 不碰 Firestore 数据库与 Security Rules，不新建数据库
#
# 用法：
#   PROJECT_ID=<Firebase/GCP 项目 ID> bash docs/deploy/setup-dev-preview.sh
#
# 可以重复执行：已存在的资源会跳过。
set -euo pipefail

PROJECT_ID="${PROJECT_ID:?请先设置 PROJECT_ID，例如：PROJECT_ID=my-project bash setup-dev-preview.sh}"
REGION="${REGION:-asia-southeast1}"
GITHUB_REPO="jazkng/KPI-KIM-LIAN-KEE"
SERVICE="erp-v2-dev"
DOMAIN="dev.kimliankee.app"
RUNTIME_SA="erp-v2-dev-runtime@${PROJECT_ID}.iam.gserviceaccount.com"
DEPLOY_SA="erp-v2-dev-deployer@${PROJECT_ID}.iam.gserviceaccount.com"

step() { echo; echo "==> $*"; }
exists() { "$@" >/dev/null 2>&1; }

gcloud config set project "${PROJECT_ID}" >/dev/null
PROJECT_NUMBER="$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')"

step "1/8 启用所需 API"
gcloud services enable run.googleapis.com artifactregistry.googleapis.com \
  iamcredentials.googleapis.com secretmanager.googleapis.com sts.googleapis.com

step "2/8 Artifact Registry 镜像仓库 erp-v2"
exists gcloud artifacts repositories describe erp-v2 --location "${REGION}" || \
  gcloud artifacts repositories create erp-v2 --repository-format=docker --location "${REGION}" \
    --description "ERP V2 preview images"

step "3/8 服务账号（运行用 / 部署用）"
exists gcloud iam service-accounts describe "${RUNTIME_SA}" || \
  gcloud iam service-accounts create erp-v2-dev-runtime --display-name "ERP V2 preview runtime"
exists gcloud iam service-accounts describe "${DEPLOY_SA}" || \
  gcloud iam service-accounts create erp-v2-dev-deployer --display-name "ERP V2 preview deployer (GitHub Actions)"

step "4/8 Secret Manager（值只在这里输入，不会显示在画面或保存到任何文件）"
create_secret() {
  local name="$1" value="$2"
  if exists gcloud secrets describe "${name}"; then
    echo "  ${name} 已存在，跳过（如需更换：gcloud secrets versions add ${name} --data-file=-）"
  else
    printf '%s' "${value}" | gcloud secrets create "${name}" --data-file=- --replication-policy=automatic
  fi
  gcloud secrets add-iam-policy-binding "${name}" --member "serviceAccount:${RUNTIME_SA}" \
    --role roles/secretmanager.secretAccessor >/dev/null
}
if ! exists gcloud secrets describe erp-v2-dev-preview-password; then
  PREVIEW_PW="$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-24)"
  create_secret erp-v2-dev-preview-password "${PREVIEW_PW}"
  echo
  echo "  ┌──────────────────────────────────────────────────────────────┐"
  echo "  │ 预览站密码（只显示这一次，请立即存入密码管理器）：            │"
  echo "  │   ${PREVIEW_PW}"
  echo "  │ 登录时帐号随意填写，密码填上面这串。                          │"
  echo "  └──────────────────────────────────────────────────────────────┘"
  unset PREVIEW_PW
else
  create_secret erp-v2-dev-preview-password ""
fi
if ! exists gcloud secrets describe erp-v2-dev-gemini-api-key; then
  read -r -s -p "  请输入预览站专用的 GEMINI_API_KEY（输入时不会显示）：" GEMINI_KEY; echo
  create_secret erp-v2-dev-gemini-api-key "${GEMINI_KEY}"; unset GEMINI_KEY
else
  create_secret erp-v2-dev-gemini-api-key ""
fi
if ! exists gcloud secrets describe erp-v2-dev-internal-api-key; then
  read -r -s -p "  请输入发票扫描服务的 INTERNAL_API_KEY（与 ap-ai-service 相同；输入时不会显示）：" INTERNAL_KEY; echo
  create_secret erp-v2-dev-internal-api-key "${INTERNAL_KEY}"; unset INTERNAL_KEY
else
  create_secret erp-v2-dev-internal-api-key ""
fi

step "5/8 建立 Cloud Run 服务 ${SERVICE}（先放一个占位容器，之后由 GitHub Actions 部署正式版本）"
if ! exists gcloud run services describe "${SERVICE}" --region "${REGION}"; then
  gcloud run deploy "${SERVICE}" --image us-docker.pkg.dev/cloudrun/container/hello \
    --region "${REGION}" --service-account "${RUNTIME_SA}" --no-allow-unauthenticated --quiet
fi
# 访问控制由服务端的预览站密码负责（PREVIEW_ACCESS_PASSWORD），Cloud Run 本身开放访问
gcloud run services add-iam-policy-binding "${SERVICE}" --region "${REGION}" \
  --member allUsers --role roles/run.invoker >/dev/null

step "6/8 部署账号的最小权限（只限 ${SERVICE} 这一个服务）"
gcloud run services add-iam-policy-binding "${SERVICE}" --region "${REGION}" \
  --member "serviceAccount:${DEPLOY_SA}" --role roles/run.developer >/dev/null
gcloud artifacts repositories add-iam-policy-binding erp-v2 --location "${REGION}" \
  --member "serviceAccount:${DEPLOY_SA}" --role roles/artifactregistry.writer >/dev/null
gcloud iam service-accounts add-iam-policy-binding "${RUNTIME_SA}" \
  --member "serviceAccount:${DEPLOY_SA}" --role roles/iam.serviceAccountUser >/dev/null

step "7/8 GitHub Workload Identity Federation（只接受 ${GITHUB_REPO} 的 develop-v2）"
exists gcloud iam workload-identity-pools describe github --location global || \
  gcloud iam workload-identity-pools create github --location global --display-name "GitHub Actions"
exists gcloud iam workload-identity-pools providers describe erp-v2 --location global --workload-identity-pool github || \
  gcloud iam workload-identity-pools providers create-oidc erp-v2 --location global \
    --workload-identity-pool github --display-name "KPI-KIM-LIAN-KEE develop-v2" \
    --issuer-uri "https://token.actions.githubusercontent.com" \
    --attribute-mapping "google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
    --attribute-condition "assertion.repository=='${GITHUB_REPO}' && assertion.ref=='refs/heads/develop-v2'"
gcloud iam service-accounts add-iam-policy-binding "${DEPLOY_SA}" --role roles/iam.workloadIdentityUser \
  --member "principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github/attribute.repository/${GITHUB_REPO}" >/dev/null

step "8/8 自定义网域 ${DOMAIN}"
echo "  如果尚未验证 kimliankee.app 的网域所有权，请先执行：gcloud domains verify kimliankee.app"
if gcloud beta run domain-mappings describe --domain "${DOMAIN}" --region "${REGION}" >/dev/null 2>&1; then
  echo "  网域映射已存在。"
else
  gcloud beta run domain-mappings create --service "${SERVICE}" --domain "${DOMAIN}" --region "${REGION}" || \
    echo "  ⚠️ 网域映射未成功（可能是网域尚未验证，或此区域不支持）。请把错误讯息转告 Claude Code。"
fi
echo "  需要在 Cloudflare 添加的 DNS 记录："
gcloud beta run domain-mappings describe --domain "${DOMAIN}" --region "${REGION}" \
  --format="table(status.resourceRecords[].type, status.resourceRecords[].name, status.resourceRecords[].rrdata)" 2>/dev/null || true
echo "  ⚠️ Cloudflare 中这条记录必须设为「DNS only（灰色云）」，否则 Google 无法签发 HTTPS 证书。"

cat <<EOF

==================== 完成 ====================
请到 GitHub → Settings → Secrets and variables → Actions → Variables，新增以下变量（都不是密钥）：

  GCP_PROJECT_ID     = ${PROJECT_ID}
  GCP_REGION         = ${REGION}
  GCP_WIF_PROVIDER   = projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github/providers/erp-v2
  GCP_DEPLOY_SA      = ${DEPLOY_SA}
  GCP_RUNTIME_SA     = ${RUNTIME_SA}
  VITE_AP_AI_API_URL = （发票扫描服务网址，与 V1 相同）
  VITE_FIREBASE_API_KEY / VITE_FIREBASE_AUTH_DOMAIN / VITE_FIREBASE_PROJECT_ID /
  VITE_FIREBASE_STORAGE_BUCKET / VITE_FIREBASE_MESSAGING_SENDER_ID /
  VITE_FIREBASE_APP_ID / VITE_FIREBASE_MEASUREMENT_ID
                     = Firebase Console → 项目设定 → 你的应用 → SDK 设定中的值（与 V1 相同的公开配置）

然后到 GitHub → Actions → 「Deploy dev preview」→ Run workflow（分支选 develop-v2，action 选 deploy）。
EOF
