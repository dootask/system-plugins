---
id: approve.notify.concept
title: 审批通知（机器人卡片消息）
type: concept
feature: approve
scope: end-user
locale: zh
aliases:
  - 审批通知
  - 审批机器人
  - 待办提醒
  - 审批结果通知
  - approval-alert
  - 收到审批消息
related_tools: []
related_pages: [application]
prerequisites:
  - 应用市场已安装 approve 插件
negative:
  - 通知由系统自动发送，无需手动催办，目前没有单独的「催办」按钮
  - 撤回是发起人本人操作，不会再给发起人发结果通知
last_verified: v1.7.90
---

# 审批通知（机器人卡片消息）

## 是什么
审批进展会由名为 `approval-alert` 的机器人在 DooTask 聊天里推送一张可点击的卡片消息，点「查看详情」即可直接跳到对应审批单。无需一直盯着审批页。

## 什么时候会收到通知
- **有新待办时**：当一张审批单流转到你需要审批的节点，你会收到「待你审批」的卡片
- **被抄送时**：流程把你设为抄送人，你会收到知会卡片
- **审批结束时**：发起人会收到结果通知（通过 / 拒绝）

## 卡片内容
卡片是 Markdown 格式，含：
- 标题（谁提交的什么申请）
- 关键摘要行（请假 / 加班 / 报销等模板会自动提取类型、起止时间、事由等）
- 「查看详情」按钮，一键打开审批单

## 说明
- 通知发送失败不会影响审批本身，审批流程照常进行
- 不同模板的摘要内容不同，缺少对应字段时摘要会自动略过

## 相关
- 审批单详情看什么：[[approve.instance-status.concept]]
- 怎么处理待办：[[approve.todo.howto]]
