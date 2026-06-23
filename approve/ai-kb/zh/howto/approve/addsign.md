---
id: approve.addsign.howto
title: 加签（拉更多人一起审）
type: howto
feature: approve
scope: end-user
locale: zh
aliases:
  - 加签
  - 加人审批
  - 拉人一起审
  - 多找人审
  - 临时加审批人
related_tools: []
related_pages: [application]
prerequisites:
  - 应用市场已安装 approve 插件
  - 我是当前待办审批人
negative:
  - 加签是把人加进当前这一步，不是新建一个独立节点
  - 加签只影响当前节点，不改后续节点的审批人
last_verified: v1.7.90
---

# 加签（拉更多人一起审）

## 是什么
加签是当你是当前审批人、觉得这一步还需要别人一起把关时，临时把一个或多个人拉进**当前这一步**一起审批。加签人和原审批人在同一步并行处理。

## 操作步骤
1. 打开待你处理的审批单详情
2. 在操作区点「加签」
3. 选择要加进来的人（可多选）
4. 确认提交

## 加签后会怎样
- 被加签的人进入「待处理」并收到通知，在流程进度里标「加签」
- 他们按当前节点的审批方式参与：
  - 会签：包括加签人在内所有人都通过，这一步才通过
  - 依次：加签人加入待审队列按序处理
- 加签人若拒绝，同样会导致整单终止
- 后续节点照原模板继续，不受影响

## 加签 vs 转交
- **加签**：加人——你和新人一起审这一步
- **转交**：换人——这一步交给别人审，你退出，详见 [[approve.transfer.howto]]

## 相关
- 处理待办：[[approve.todo.howto]]
- 转交：[[approve.transfer.howto]]
- 流程节点与审批方式：[[approve.node.concept]]
