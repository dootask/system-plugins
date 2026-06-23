---
id: approve.withdraw.howto
title: 撤回自己发起的审批
type: howto
feature: approve
scope: end-user
locale: zh
aliases:
  - 撤回审批
  - 撤销申请
  - 取消审批
  - 收回审批
  - 发错了想撤
related_tools: []
related_pages: [application]
prerequisites:
  - 应用市场已安装 approve 插件
  - 是我本人发起的审批单
negative:
  - 只有发起人能撤回，审批人不能撤回
  - 一旦有人开始处理（已有人审过当前步），就不能撤回了
  - 撤回后整单终止，不能再恢复
last_verified: v1.7.90
---

# 撤回自己发起的审批

## 是什么
撤回是发起人主动取消一张还在进行中的审批单。撤回后整单立即终止，状态变「已撤回」。

## 能撤回的条件
- 你是这张单子的**发起人**
- 单子还在**审批中**
- 当前这一步**还没有人处理过**（一旦有审批人批准 / 拒绝 / 退回，就不能撤回了）

## 操作步骤
1. 在「我发起」里打开该审批单详情
2. 满足条件时操作区会出现「撤回」按钮
3. 点「撤回」并确认

## 撤回后会怎样
- 单子状态变「已撤回」，不再流转，也无法恢复
- 当前待处理的人不用再审
- 想重新申请需要重新发起一张新的审批单

## 撤不了怎么办
- 没有「撤回」按钮通常是因为已经有人处理过当前步，详见 [[approve.cannot-withdraw.faq]]
- 这种情况只能让当前审批人拒绝或退回，或继续走完流程

## 相关
- 撤不了怎么办：[[approve.cannot-withdraw.faq]]
- 审批单状态：[[approve.instance-status.concept]]
