#!/usr/bin/env bash
# 御膳智控 ERP V2 · 把 epr.kimliankee.app 从测试站（erp-v2-dev）搬到正式站（erp-v2）
# 由负责人在 Google Cloud Shell 执行。负责人 2026-10-23 决定：dev 是测试站，epr 是正式站。
#
# 前提：已执行 setup-production.sh，且正式站已至少发布过一次（deploy-production.yml action=release）。
# ⚠️ 搬的过程中 epr 会有 15–60 分钟打不开（Google 要重新签发 HTTPS 证书），请在店休时执行。
#    这段时间员工可以先用 dev.kimliankee.app（同一个资料库）。
# Cloudflare 的 epr 记录不用改（两边都指向 ghs.googlehosted.com）。
#
# 用法：
#   PROJECT_ID=<项目 ID> bash docs/deploy/move-epr-to-production.sh
set -euo pipefail

PROJECT_ID="${PROJECT_ID:?请先设置 PROJECT_ID}"
REGION="${REGION:-asia-southeast1}"
DOMAIN="epr.kimliankee.app"
PROD="erp-v2"

gcloud config set project "${PROJECT_ID}" >/dev/null

echo "==> 检查正式站 ${PROD} 已发布过"
IMAGE=$(gcloud run services describe "${PROD}" --region "${REGION}" --format='value(spec.template.spec.containers[0].image)')
case "${IMAGE}" in
  *cloudrun/container/hello*|"") echo "正式站还没有发布过（目前是占位容器）。请先发布：action=release"; exit 1;;
esac
echo "   正式站镜像：${IMAGE}"

CURRENT=$(gcloud beta run domain-mappings describe --domain "${DOMAIN}" --region "${REGION}" --format='value(spec.routeName)' 2>/dev/null || true)
if [ "${CURRENT}" = "${PROD}" ]; then echo "${DOMAIN} 已经指向正式站，不用再搬。"; exit 0; fi

echo
echo "即将把 ${DOMAIN} 从「${CURRENT:-（无）}」搬到正式站「${PROD}」。"
echo "搬的过程中 ${DOMAIN} 会有 15–60 分钟打不开。"
read -r -p "确认现在执行？输入 yes 继续：" OK
[ "${OK}" = "yes" ] || { echo "已取消，没有改动。"; exit 0; }

if [ -n "${CURRENT}" ]; then
  gcloud beta run domain-mappings delete --domain "${DOMAIN}" --region "${REGION}" --quiet
fi
gcloud beta run domain-mappings create --service "${PROD}" --domain "${DOMAIN}" --region "${REGION}"

cat <<MSG

完成。等 15–60 分钟，Cloud Run →「网域映射」里 ${DOMAIN} 变成绿色勾就可以用。
Cloudflare 的 epr 记录不用改（仍是 DNS only / 灰色云）。

回滚（搬回测试站）：
  gcloud beta run domain-mappings delete --domain ${DOMAIN} --region ${REGION} --quiet
  gcloud beta run domain-mappings create --service erp-v2-dev --domain ${DOMAIN} --region ${REGION}
MSG
