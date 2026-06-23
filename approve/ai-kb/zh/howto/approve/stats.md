---
id: approve.stats.howto
title: 查看审批数据统计
type: howto
feature: approve
scope: admin
locale: zh
aliases:
  - 审批统计
  - 数据统计
  - 审批报表
  - 多少待审
  - 审批数量统计
related_tools: []
related_pages: [application]
prerequisites:
  - 应用市场已安装 approve 插件
  - 当前用户是管理员
negative:
  - 「数据统计」仅管理员可见
  - 统计是数量概览，不是逐单明细；要明细请用导出
last_verified: v1.7.90
---

# 查看审批数据统计

## 入口
- 「应用」→「审批」→「数据统计」（仅管理员可见）

## 看什么
统计页以卡片形式展示各状态审批单的数量概览，例如：
- 总数（突出显示）
- 待我审批
- 审批中 / 已通过 / 已拒绝 / 已撤回 / 已归档 等各状态计数（数量为 0 的状态不显示，避免冗余）

## 导出明细
统计页提供 XLSX 导出，可按日期范围、状态、模板、关键词筛选后导出逐单明细，详见 [[approve.export.howto]]。

## 相关
- 导出 XLSX：[[approve.export.howto]]
- 审批单状态：[[approve.instance-status.concept]]
