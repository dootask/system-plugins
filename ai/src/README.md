# DooTask AI

DooTask AI 是一个灵活的 AI 对话服务，支持多种 AI 模型，提供统一的 API 接口。

## 功能特点

### 支持的 AI 模型

1. **OpenAI GPT** (model_type: openai)
   - model_name: gpt-4o ...
   - 特点：强大的通用语言理解和生成能力

2. **Anthropic Claude** (model_type: claude)
   - model_name: claude-3-5-sonnet-latest ...
   - 特点：强大的自然语言处理能力，擅长流畅对话和深度内容理解

3. **Deepseek** (model_type: deepseek)
   - model_name: deepseek-reasoner ...
   - 特点：高效精准的数据挖掘与分析，提供深度洞察和智能决策支持

4. **Google Gemini** (model_type: gemini)
   - model_name: gemini-1.5-pro ...
   - 特点：支持多模态输入的新一代 AI 模型

5. **智谱 AI** (model_type: zhipu)
   - model_name: glm-4 ...
   - 特点：专注中文处理的大语言模型

6. **通义千问** (model_type: qwen)
   - model_name: qwen-turbo ...
   - 特点：阿里巴巴开发的多语言模型

7. **百度文心一言** (model_type: wenxin)
   - model_name: ernie-4.0-8k ...
   - 特点：擅长中文理解和生成的模型

8. **Cohere** (model_type: cohere)
   - model_name: command-r ...
   - 特点：适用于文本生成、分类和搜索等任务

9. **Ollama** (model_type: ollama)
   - model_name: ollama-3.5-8k ...
   - 特点：适用于文本生成、分类和搜索等任务

10. **XAI** (model_type: grok or xai)
   - model_name: grok-2 ...
   - 特点：适用于文本生成、分类和搜索等任务

### 核心功能

- 统一的 API 接口
  - RESTful API 设计
  - 流式响应支持（Server-Sent Events）
  - 完整的错误处理

- 自动化管理
  - 自动超时检测（1分钟）
  - 自动数据清理（10分钟）
  - 内存优化管理

## 快速开始

### 环境要求

- Python 3.8+
- Flask
- LangChain
- Redis
- Requests

### 安装

#### 方式一：直接安装

1. 克隆仓库：
```bash
git clone [repository-url]
cd dootask-ai
```

2. 安装并启动 Redis：
```bash
# macOS
brew install redis
brew services start redis

# Linux
sudo apt-get install redis-server
sudo systemctl start redis-server
```

3. 安装依赖：
```bash
python -m venv venv
source venv/bin/activate  # Linux/macOS
# 或 .\venv\Scripts\activate  # Windows
pip install -r requirements.txt
```

4. 启动服务：
```bash
python main.py
```

#### 方式二：Docker 部署

1. 克隆仓库：
```bash
git clone [repository-url]
cd dootask-ai
```

2. 构建并启动服务：
```bash
# 构建镜像并启动服务（首次部署或代码更新时使用）
docker-compose up --build -d

# 仅启动服务（镜像已存在时使用）
docker-compose up -d
```

3. 查看服务日志：
```bash
docker-compose logs -f app
```

4. 停止服务：
```bash
docker-compose down
```

默认服务端口为 5001，可通过环境变量 PORT 修改。
Redis 默认连接到 localhost:6379，可通过环境变量 REDIS_HOST 和 REDIS_PORT 修改。

## API 文档

API 文档提供了以下访问方式：

1. 在线查看：
   - 直接访问 Swagger UI：http://localhost:5001/swagger

2. 导入到 Swagger Editor：
   - 将 http://localhost:5001/swagger.yaml 的内容复制到编辑器中
   - 或者直接导入 URL：File -> Import URL -> 输入 http://localhost:5001/swagger.yaml

这样你可以：
- 查看所有 API 端点的详细说明
- 了解请求和响应的数据结构
- 直接在线测试 API 接口

### API 使用示例

#### 对话模式

对话模式支持上下文对话，通过 `/chat` 接口发送消息，然后通过 `/stream/{msg_id}/{stream_key}` 接口获取流式响应。

#### 发起对话

```http
GET /chat?text=hello&token=xxx&dialog_id=123&msg_uid=456&bot_uid=789&version=1.0&extras={"model_type":"openai","model_name":"gpt-3.5-turbo","server_url":"https://api.example.com","api_key":"your-api-key"}
```

参数说明：
- `text`: 对话内容
- `token`: 认证令牌
- `dialog_id`: 对话ID
- `msg_uid`: 消息用户ID
- `bot_uid`: 机器人用户ID
- `version`: API版本
- `extras`: 额外参数（JSON字符串）
  - `model_type`: 模型类型
  - `model_name`: 模型名称
  - `system_message`: 系统提示词（可选）
  - `server_url`: 服务器地址
  - `api_key`: API密钥
  - `base_url`: 基础URL（可选）
  - `agency`: 代理服务器（可选）
  - `temperature`: 温度（可选，默认为 0.7）
  - `context_key`: 自定义上下文键（可选，留空自动生成）
  - `before_text`: 前置上下文，在系统提示词之后（可选，不保存在下次上下文，上下文优先级：自定义上下文（对话内容） > 系统提示词 > 前置上下文）
  - `context_limit`: 上下文限制（可选）

#### 获取响应流

```http
GET /stream/{msg_id}/{stream_key}
```

参数说明：
- `msg_id`: 消息ID
- `stream_key`: 流密钥

### 直接调用模式

直接调用模式不保存上下文，适合单次问答场景。通过 `/invoke` 接口直接获取 AI 响应。

```http
GET /invoke?text=hello&model_type=openai&model_name=gpt-4&api_key=your-api-key&system_message=optional-system-message&agency=optional-proxy
```

参数说明：
- `text`: 对话内容（必需）
- `api_key`: API密钥（必需）
- `model_type`: 模型类型（可选，默认为 openai）
- `model_name`: 模型名称（可选，默认为 gpt-3.5-turbo）
- `system_message`: 系统提示词（可选）
- `base_url`: 基础URL（可选）
- `agency`: 代理服务器（可选）
- `temperature`: 温度（可选，默认为 0.7）
- `context_key`: 上下文键（可选）
- `before_text`: 前置上下文（可选）
- `context_limit`: 上下文限制（可选）

响应格式：
```json
{
    "code": 200,
    "data": {
        "content": "AI 的回复内容",
        "usage": {
            "total_tokens": 总token数,
            "prompt_tokens": 输入token数,
            "completion_tokens": 输出token数
        }
    }
}
```

## 开发说明

### 目录结构

```
dootask-ai/
├── main.py          # 主程序入口
├── helper/          # 辅助模块目录
│   ├── __init__.py  # Python 包标记
│   ├── redis.py     # Redis 管理类
│   ├── request.py   # 请求处理类
│   └── utils.py     # 工具函数
├── tests/           # 测试目录
│   ├── __init__.py  # Python 包标记
│   └── test_main.py # 主要测试文件
├── static/          # 静态文件
│   └── swagger.yaml # API文档
├── docker-compose.yml # Docker 编排配置
├── Dockerfile        # Docker 构建文件
└── requirements.txt  # 项目依赖
```

### 核心组件

1. RedisManager 类（helper/redis.py）
   - 管理会话上下文和输入数据
   - 支持多进程数据共享
   - 自动过期和清理机制

2. Request 类（helper/request.py）
   - 处理与服务器的通信
   - 支持不同的请求动作（sendtext/stream）
   - 自动处理超时和错误

3. 超时管理
   - 后台线程自动检查超时请求
   - 自动清理过期数据
   - 资源优化管理

4. 流式响应
   - 支持 SSE（Server-Sent Events）
   - 实时响应更新
   - 完整的错误处理

## 测试

项目包含自动化测试套件，使用 pytest 进行测试。

### 运行测试

1. 安装测试依赖：
```bash
pip install pytest pytest-cov
```

2. 运行测试：
```bash
# 运行所有测试
pytest

# 运行并生成覆盖率报告
pytest --cov=./ --cov-report=html
```

### 测试内容

- 健康检查接口测试
- Redis 连接测试
- API 功能测试
- 错误处理测试

### CI/CD

项目使用 GitHub Actions 进行持续集成和部署：

1. 自动化测试
   - 运行单元测试
   - 生成代码覆盖率报告
   - 上传覆盖率报告到 Codecov

2. Docker 构建
   - 构建多架构镜像（amd64/arm64）
   - 测试 docker-compose 部署
   - 推送镜像到 GitHub Container Registry 和 Docker Hub

## 部署

### Docker 部署

使用 docker-compose 一键部署：

```bash
# 启动服务
docker-compose up -d

# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

### 环境变量

可以通过环境变量配置服务：

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| PORT | 服务端口 | 5001 |
| WORKERS | 工作进程数 | 4 |
| TIMEOUT | 超时时间（秒） | 120 |
| REDIS_HOST | Redis 主机地址 | localhost |
| REDIS_PORT | Redis 端口 | 6379 |
| REDIS_DB | Redis 数据库编号 | 0 |
| HTTP_PROXY | HTTP 代理地址 | 无 |
| HTTPS_PROXY | HTTPS 代理地址 | 无 |

### 代理配置

对于某些需要代理访问的模型（如 Gemini），可以通过以下方式配置代理：

1. 环境变量方式：
```bash
export HTTP_PROXY=socks5://proxyuser:password@host:port
export HTTPS_PROXY=socks5://proxyuser:password@host:port
docker-compose up
```

2. API 调用时指定：
```json
{
    "extras": {
        "model_type": "gemini",
        "model_name": "gemini-pro",
        "api_key": "your-api-key",
        "agency": "socks5://proxyuser:password@host:port"
    }
}
```

注意：使用代理时请确保：
- 代理服务器稳定可用
- 代理服务器支持相应的协议（HTTP/HTTPS/SOCKS5）
- 如有需要，正确配置代理认证信息

## 注意事项

1. API 密钥安全
   - 不要在代码中硬编码 API 密钥
   - 使用环境变量或配置文件管理敏感信息

2. Redis 配置
   - 生产环境建议配置 Redis 密码
   - 使用专门的 Redis 服务器
   - 定期备份 Redis 数据

3. 代理设置
   - 可通过 extras.agency 参数设置代理
   - 支持 HTTP 和 HTTPS 代理

4. 错误处理
   - 所有请求都有适当的错误处理
   - 超时自动处理
   - 详细的错误信息返回

## 许可证

本项目采用 [MIT License](LICENSE) 开源许可证。