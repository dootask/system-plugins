# syntax=docker/dockerfile:1.6

# ---- builder ----
FROM node:20 AS builder
WORKDIR /app
RUN corepack enable pnpm

COPY package.json pnpm-lock.yaml ./
RUN CI=true pnpm install --frozen-lockfile

COPY . .
ENV NODE_ENV=production
RUN pnpm build

# ---- runner ----
# Nitro 已把服务端依赖打进 .output，运行时无需 node_modules。
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000

COPY --from=builder /app/.output ./.output

EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
