# syntax=docker/dockerfile:1.6

# ---- builder ----
FROM node:20 AS builder
WORKDIR /app
RUN corepack enable pnpm
# better-sqlite3 优先用预编译二进制；若回退到源码编译则需以下工具链
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml ./
RUN CI=true pnpm install --frozen-lockfile

COPY . .
ENV NODE_ENV=production
RUN pnpm build

# ---- runner ----
# Nitro 已把服务端依赖（含 better-sqlite3 原生模块）打进 .output，运行时无需 node_modules。
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000

COPY --from=builder /app/.output ./.output

EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
