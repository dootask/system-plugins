# DooTask AI UI

基于 Vite + React + shadcn/ui 的前端子项目，用于在 DooTask 环境中展示 AI 助手列表并配置各类助手参数。

## 功能概览

- **AI 助手列表**：展示固定的助手清单、简介与模型标签，一键发起会话。
- **管理员配置入口**：使用 `@dootask/tools` 的 `requestAPI` 同步读取 / 提交 `system/setting/aibot` 接口数据，支持动态字段渲染。
- **默认模型获取**：支持按需调用 `assistant/models` 获取助手默认模型列表。
- **DoTask 工具库集成**：依赖 `appReady`、`getUserInfo`、`openDialogUserid`、`modalInfo` 等工具方法，需在 DooTask 插件容器内运行。

## 快速开始

```bash
cd dootask-ai/ui
npm install
npm run dev
```

> 项目默认自动检测 URL 中的 `?theme=dark` 参数以应用暗色主题。

### 可用脚本

| 命令             | 说明                       |
| ---------------- | -------------------------- |
| `npm run dev`    | 启动本地开发服务器         |
| `npm run build`  | 产出生产构建               |
| `npm run preview`| 预览构建产物               |

## 目录结构

```
ui/
  ├─ public/avatars/          # 助手头像
  ├─ src/
  │   ├─ components/aibot/    # 列表卡片与设置抽屉
  │   ├─ components/ui/       # shadcn/ui 基础组件
  │   ├─ data/                # 助手静态数据与配置元数据
  │   ├─ lib/                 # 辅助方法（字段合并、模型解析等）
  │   └─ App.tsx              # 主界面逻辑
  └─ tailwind.config.{js,ts}  # Tailwind 配置
```

## 注意事项

- 助手设置面板仅对管理员账号开放，管理员判断来自 `getUserInfo().identity` 包含 `admin`。
- `开始聊天` 按钮会触发 `users/search/ai` 接口，并调用 `openDialogUserid` 打开对应会话。
- `使用默认模型列表` 会触发 `system/setting/aibot_defmodels` API，Ollama 需先填写 `Base URL` 等参数。

## 依赖

- Node.js 18+
- DooTask 插件环境（提供 `@dootask/tools` 能力）
- Tailwind CSS + shadcn/ui

如需在其它环境调试，可根据需要 mock `@dootask/tools` 的接口。
