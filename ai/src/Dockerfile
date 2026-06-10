# UI 构建阶段
FROM node:20-alpine AS ui-builder
WORKDIR /ui
COPY ui/package.json ui/package-lock.json ./
RUN npm ci
COPY ui .
RUN npm run build

# Python 依赖构建阶段
FROM python:3.12-slim-bookworm AS builder

# 设置工作目录
WORKDIR /app

# 设置环境变量
ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONDONTWRITEBYTECODE=1

# 安装编译依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

# 复制依赖文件
COPY requirements.txt .

# 安装依赖
RUN pip install --no-cache-dir -r requirements.txt && \
    find /usr/local -type d -name __pycache__ -exec rm -rf {} + && \
    rm -rf /root/.cache /tmp/*

# 运行阶段
FROM python:3.12-slim-bookworm

WORKDIR /app

# 从构建阶段复制 Python 包
COPY --from=builder /usr/local/lib/python3.12/site-packages/ /usr/local/lib/python3.12/site-packages/
COPY --from=builder /usr/local/bin/uvicorn /usr/local/bin/uvicorn

# 设置环境变量
ENV PORT=5001 \
    WORKERS=4 \
    TIMEOUT=120 \
    PYTHONUNBUFFERED=1 \
    REDIS_HOST=redis \
    REDIS_PORT=6379 \
    TIKTOKEN_CACHE_DIR=/app/tiktoken_cache

# 安装 curl
RUN apt-get update && apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*

# 预下载 tiktoken 词表并烤进镜像，避免运行时每次重启联网下载
# （helper/context.py 在 import 期调用 get_encoding，曾因联网下载卡 ~100s）
RUN python -c "import tiktoken; tiktoken.get_encoding('o200k_base'); tiktoken.get_encoding('cl100k_base')"

# 复制项目文件
COPY main.py .
COPY helper/ helper/
COPY static/ static/
COPY --from=ui-builder /ui/dist ./static/ui
COPY requirements.txt .
COPY README.md .
COPY LICENSE .

# 创建配置目录并设置非 root 用户权限
RUN useradd -m -u 1000 appuser && \
    mkdir -p /app/config && \
    chown -R appuser:appuser /app

USER appuser

# 暴露端口
EXPOSE $PORT

# 健康检查
# RAG 初始化已后台化，服务通常几秒内就绪；缩短 interval 让容器更快翻 healthy。
HEALTHCHECK --start-period=10s --interval=10s --timeout=5s --retries=3 \
    CMD curl -f http://localhost:$PORT/health || exit 1

# 启动命令
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port $PORT --workers $WORKERS"]
