---
id: approve.export.howto
title: 导出审批数据为 Excel
type: howto
feature: approve
scope: admin
locale: zh
aliases:
  - 导出审批
  - 导出 Excel
  - 审批表格下载
  - 审批数据导出
  - XLSX 导出
related_tools: []
related_pages: [application]
prerequisites:
  - 应用市场已安装 approve 插件
  - 当前用户是管理员
negative:
  - 导出仅管理员可用
  - 单次最多约 1 万行，超出会截断；没有时间跨度（如 35 天）的硬性限制
last_verified: v1.7.90
---

# 导出审批数据为 Excel

## 入口
- 「应用」→「审批」→「数据统计」→ 导出

## 操作步骤
1. 打开导出对话框
2. 按需设置筛选条件（都可不填）：
   - **日期范围**：默认最近 30 天，可自定义任意区间
   - **状态**：勾选要导出的状态，不勾 = 全部
   - **模板**：选一个模板则会额外展开该模板的表单字段为列；不选 = 全部模板
   - **关键词**：按标题搜索
3. 确认导出，浏览器直接下载一个 `.xlsx` 文件

## 导出内容
- 固定包含约 12 列：单号、标题、模板、分类、发起人、发起部门、状态、发起时间、结束时间、耗时、末次处理人、末次意见
- 若筛选时选定了某个模板，会再追加该模板表单字段对应的列
- 导出是同步直接下载，不需要等机器人推链接

## 行数上限
单次导出最多约 1 万行。数据超过上限时会截断并提示，可缩小日期范围或加筛选条件分批导出。

## 相关
- 数据统计：[[approve.stats.howto]]
- 审批单状态：[[approve.instance-status.concept]]
