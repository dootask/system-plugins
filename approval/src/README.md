# DooTask 审批插件（Approval）

为 DooTask 提供灵活的审批流程管理，支持请假、加班、外出、报销等多种业务申请。本仓库包含审批服务的完整源码、容器构建脚本以及 DooTask 插件的打包与自动发布配置。

- **后端**：Go 实现的工作流引擎与 HTTP 接口，监听 `8700` 端口。
- **前端**：基于 Vite + Vue 3 的审批配置与流转界面（`workflow-vue3/`）。
- **dootask-plugin/**：插件打包配置（元数据、Nginx 反向代理、Docker Compose）。
- **Dockerfile**：多阶段自包含构建，单条命令即可产出可运行镜像。

## 目录结构

```
.
├── Dockerfile                  # 多阶段构建：前端(vite) + 后端(Go) + nginx
├── main.go                     # 后端服务入口
├── config.json                 # 后端运行配置（端口、数据库等默认值）
├── workflow-config/            # 配置加载（读取 config.json，可被环境变量覆盖）
├── workflow-engine/            # 工作流引擎（模型、服务）
├── workflow-controller/        # HTTP 控制器
├── workflow-router/            # 路由
├── util/                       # 通用工具
├── workflow-vue3/              # 前端源码（Vite + Vue 3）
├── docker/nginx/default.conf   # 容器内 Nginx 配置（静态资源 + /api 反向代理）
├── dootask-plugin/             # 插件打包与发布配置
│   ├── config.yml              # 插件元信息（名称、描述、标签）
│   └── 0.1.0/                  # 运行配置（docker-compose.yml / nginx.conf）
└── .github/workflows/release.yml  # 打 tag 自动构建并发布
```

## 技术栈

- Go 1.20（后端，CGO 关闭，静态编译）
- Vue 3 + Vite 3（前端）
- Nginx（容器内托管前端静态资源并反向代理后端 `/api`）
- MySQL（数据存储）

## 构建镜像

Dockerfile 为三阶段自包含构建，**无需预先编译前端或后端**，单条命令即可：

```bash
# 本地构建
DOCKER_BUILDKIT=1 docker build -t kuaifan/dooapprove:0.1.0 .

# 多架构构建并推送
docker buildx build --push -t kuaifan/dooapprove:0.1.0 \
  --platform linux/amd64,linux/arm64 .
```

三个阶段：

1. `frontend`（node:18-alpine）：`npm install` + `vite build`，产出 `workflow-vue3/dist`
2. `backend`（golang:1.20-alpine）：交叉编译出 `main`，支持多架构
3. 运行镜像（nginx:alpine）：汇总后端二进制、`config.json`、前端产物与 Nginx 配置

## 本地开发

需本机具备 Go 1.20、Node.js 18+ 以及一个可用的 MySQL。

```bash
# 后端（读取 config.json，请按本地环境调整其中的数据库连接）
go run main.go              # 监听 http://127.0.0.1:8700

# 前端（另开终端）
cd workflow-vue3
npm install
npm run dev
```

运行时数据库等连接参数可由环境变量注入（容器部署即通过此方式，见 `dootask-plugin/0.1.0/docker-compose.yml` 传入的 `MYSQL_*`、`KEY`、`DEMO_DATA` 等）。

## 发布到 DooTask 应用商店

发布通过 **推送 tag** 触发 `.github/workflows/release.yml`，自动完成：构建多架构镜像并推送到 Docker Hub（`kuaifan/dooapprove`），打包 `dootask-plugin/` 并以系统应用方式发布到 DooTask 应用商店（appid `approve`）。

```bash
git tag 0.1.9            # 纯版本号，不加 v 前缀；版本号只增不重复
git push origin 0.1.9
```

发布要点（详见 `.claude/skills/release-plugin/`）：

- **tag 不带 `v` 前缀**，tag 名即镜像 tag 和插件版本。
- 插件源目录固定叫 `dootask-plugin/0.1.0/`（占位名），CI 会在打包时重命名为 tag 名，**请勿在仓库中按版本号新建目录**。修改插件运行配置改 `0.1.0/` 下的文件，修改元信息改 `dootask-plugin/config.yml`。
- 依赖 4 个仓库级 Secrets：`DOCKER_USERNAME` / `DOCKER_PASSWORD`、`DOOTASK_USERNAME` / `DOOTASK_PASSWORD`。

面向插件使用者的安装说明见 `dootask-plugin/README.md`（中文：`dootask-plugin/README_zh.md`）。
