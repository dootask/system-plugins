# 使用官方 Golang 镜像作为构建环境
FROM golang:1.22-alpine AS builder

# 设置工作目录
WORKDIR /app

# 设置 Go 代理环境变量
ENV GOPROXY=https://goproxy.cn,direct

# 安装依赖（比如 GCC 和 SQLite3 相关的库）
RUN apk add --no-cache gcc musl-dev sqlite-dev

# 复制 go.mod 和 go.sum 文件
COPY go.mod go.sum ./

# 下载依赖
RUN go mod download

# 复制项目文件
COPY . .

# 构建主程序
RUN CGO_ENABLED=1 GOOS=linux go build -o main main.go

# 运行时镜像
FROM alpine:latest

# 安装 tzdata 包
RUN apk add --no-cache tzdata

# 设置工作目录
WORKDIR /app

# 复制构建好的二进制文件
COPY --from=builder /app/main .


RUN chmod +x /app/main

# 指定默认命令
CMD ["sh", "-c", "/app/main migrate && /app/main up"]

EXPOSE 7788
