---
id: approve.return-resubmit.howto
title: 退回与重新提交
type: howto
feature: approve
scope: end-user
locale: zh
aliases:
  - 退回审批
  - 被退回了怎么办
  - 重新提交
  - 改了再提交
  - 打回修改
  - 退回重提
related_tools: []
related_pages: [application]
prerequisites:
  - 应用市场已安装 approve 插件
negative:
  - 退回不是拒绝，单子没终止，发起人改完还能继续走
  - 重新提交后流程会按新的表单值重新走（条件分支可能改走向）
last_verified: v1.7.90
---

# 退回与重新提交

## 退回（审批人操作）
审批人觉得表单填得不对、需要发起人修改时，可在操作区点「退回」，把单子还给发起人，而不是直接拒绝。退回后单子进入「待修改」状态，回到发起人手里。

## 重新提交（发起人操作）
1. 在「我发起」里打开被退回的审批单详情
2. 此时表单区变为可编辑，按要求修改内容
3. 点「重新提交」
4. 单子重新进入审批流程继续流转

## 注意
- 重新提交会按改后的表单值重新展开流程，若模板有条件分支，走向可能随新值改变，详见 [[approve.route.concept]]
- 重新提交时也可补充评论说明改了什么

## 退回 vs 拒绝
- **退回**：单子没终止，发起人改完能继续审
- **拒绝**：整单立即终止，需重新发起新单

## 相关
- 处理待办：[[approve.todo.howto]]
- 审批单状态：[[approve.instance-status.concept]]
- 条件分支：[[approve.route.concept]]
