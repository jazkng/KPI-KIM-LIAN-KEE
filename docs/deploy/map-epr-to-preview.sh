#!/usr/bin/env bash
# 御膳智控 ERP V2 · 让预览站改用 epr.kimliankee.app 这个网址（由负责人在 Google Cloud Shell 执行）
#
# 负责人 2026-10-23 决定：现在只是更换以后要用的网址，还没有正式发布。
# 做法：在现有的预览站服务 erp-v2-dev 上多加一个网址 epr.kimliankee.app。
#   - 同一个预览站：同样有访问门禁（预览站密码）、develop-v2 合并后照样自动更新
#   - dev.kimliankee.app 保留，两个网址打开的是同一个站
#   - 不新增服务、不改程序、不碰 V1、不碰资料库与 Rules
#
# 用法：
#   PROJECT_ID=<Firebase/GCP 项目 ID> bash docs/deploy/map-epr-to-preview.sh
set -euo pipefail

PROJECT_ID="${PROJECT_ID:?请先设置 PROJECT_ID，例如：PROJECT_ID=my-project bash map-epr-to-preview.sh}"
REGION="${REGION:-asia-southeast1}"
SERVICE="erp-v2-dev"
DOMAIN="epr.kimliankee.app"

gcloud config set project "${PROJECT_ID}" >/dev/null

if gcloud beta run domain-mappings describe --domain "${DOMAIN}" --region "${REGION}" >/dev/null 2>&1; then
  echo "网址映射已存在：${DOMAIN}"
else
  gcloud beta run domain-mappings create --service "${SERVICE}" --domain "${DOMAIN}" --region "${REGION}" || {
    echo "⚠️ 网址映射未成功。请把错误讯息转告 Claude Code。"; exit 1; }
fi

echo
echo "需要在 Cloudflare 添加的 DNS 记录："
gcloud beta run domain-mappings describe --domain "${DOMAIN}" --region "${REGION}" \
  --format="table(status.resourceRecords[].type, status.resourceRecords[].name, status.resourceRecords[].rrdata)"
cat <<'MSG'

⚠️ Cloudflare 中这条记录必须设为「DNS only（灰色云）」，否则 Google 无法签发 HTTPS 证书。
⚠️ 如果 epr 目前已有记录（例如指向旧系统），改之前先截图保存，回滚时要用。
   HTTPS 证书通常 15–60 分钟内自动签发；之后用预览站密码打开 https://epr.kimliankee.app 。
⚠️ 如果 Firebase Web API Key 有「HTTP referrer」限制，加入 https://epr.kimliankee.app/* 。

回滚：gcloud beta run domain-mappings delete --domain epr.kimliankee.app --region <区域>，并把 Cloudflare 记录改回截图里的样子。
MSG
