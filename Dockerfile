# 御膳智控 ERP V2 · 预览站容器（Cloud Run：erp-v2-dev）
# V1 由 AI Studio 部署，与此文件无关。
FROM node:22-slim

# 依赖以 bun.lock 为准
RUN npm install -g bun@1.4.2
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

# Firebase Web 配置（公开配置，不是密钥）在构建时注入前端
ARG VITE_DAILY_CONTEXT_ENABLED=false
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_STORAGE_BUCKET
ARG VITE_FIREBASE_MESSAGING_SENDER_ID
ARG VITE_FIREBASE_APP_ID
ARG VITE_FIREBASE_MEASUREMENT_ID

# 部署前检查：必须是正式 Firebase 配置，不能是 Emulator 构建
RUN test -n "$VITE_FIREBASE_PROJECT_ID" || (echo "缺少 VITE_FIREBASE_PROJECT_ID" && exit 1); \
    case "$VITE_FIREBASE_PROJECT_ID" in demo-*) echo "不可部署 demo- 项目" && exit 1;; esac; \
    test -z "$VITE_USE_FIREBASE_EMULATOR" || (echo "预览站不可用 Emulator 模式构建" && exit 1)

RUN npm run build && grep -q '"emulator":false' dist/.build-mode.json

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/server.cjs"]
