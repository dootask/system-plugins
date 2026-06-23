---
id: approve.cannot-withdraw.faq
title: 为什么撤回不了审批
type: faq
feature: approve
scope: end-user
locale: zh
aliases:
  - 撤回不了
  - 没有撤回按钮
  - 撤销不了申请
  - 审批撤回失败
  - 取消不了审批
related_tools: []
related_pages: [application]
prerequisites:
  - 应用市场已安装 approve 插件
negative:
  - 已有人处理过当前步就不能撤回
  - 审批人不能撤回，只有发起人能撤回
last_verified: v1.7.90
---

# 为什么撤回不了审批

## 问题
打开自己发起的审批单，找不到「撤回」按钮，或点了撤回提示失败。

## 常见原因
- **已经有人处理过当前步**：只要审批人已经批准 / 拒绝 / 退回，就不能再撤回了
- **你不是发起人**：撤回只能由发起人操作，审批人无权撤回
- **单子已结束**：已通过 / 已拒绝 / 已撤回的单子本身就不能再撤回

## 怎么办
- 如果只是想停掉流程，可以请当前审批人拒绝或退回
- 被退回后你可以修改表单再决定是否重新提交，详见 [[approve.return-resubmit.howto]]
- 想换内容只能重新发起一张新的审批单

## 相关
- 怎么撤回：[[approve.withdraw.howto]]
- 退回与重新提交：[[approve.return-resubmit.howto]]
