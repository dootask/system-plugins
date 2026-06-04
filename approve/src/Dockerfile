# 多阶段、自包含构建
# 单条命令即可构建（无需预先 npm run build / go build）：
#   DOCKER_BUILDKIT=1 docker build -t kuaifan/dooapprove:0.1.0 .
# 多架构构建并推送：
#   docker buildx build --push -t kuaifan/dooapprove:0.1.0 --platform linux/amd64,linux/arm64 .

# ---------- 阶段 1：构建前端（workflow-vue3） ----------
FROM node:18-alpine AS frontend
WORKDIR /app/workflow-vue3
# 先装依赖以利用缓存（仓库未提交 package-lock，使用 npm install）
COPY workflow-vue3/package.json ./
RUN npm install
# 再拷贝源码并构建，产物在 /app/workflow-vue3/dist（含 approve/assets）
COPY workflow-vue3/ ./
RUN npm run build

# ---------- 阶段 2：编译后端（Go） ----------
# 使用 BUILDPLATFORM 在构建机本地架构上交叉编译，配合 buildx 实现多架构
FROM --platform=$BUILDPLATFORM golang:1.20-alpine AS backend
ARG TARGETOS
ARG TARGETARCH
ENV GO111MODULE=on \
    CGO_ENABLED=0
WORKDIR /src
# 先下载依赖以利用缓存
COPY go.mod go.sum ./
RUN go mod download
# 拷贝源码并编译
COPY . .
RUN GOOS=${TARGETOS:-linux} GOARCH=${TARGETARCH:-amd64} go build -o main main.go

# ---------- 阶段 3：运行镜像（nginx + 后端二进制 + 前端产物） ----------
FROM nginx:alpine
WORKDIR /var/doo/

COPY --from=backend /src/main .
COPY config.json .
COPY workflow-engine/model/seeders/ /var/doo/workflow-engine/model/seeders/
COPY --from=frontend /app/workflow-vue3/dist/ /var/doo/dist
COPY docker/nginx/default.conf /etc/nginx/conf.d/

CMD nginx;./main
