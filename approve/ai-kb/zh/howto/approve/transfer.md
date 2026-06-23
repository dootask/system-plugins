---
id: approve.transfer.howto
title: 转交审批给他人
type: howto
feature: approve
scope: end-user
locale: zh
aliases:
  - 转交审批
  - 转给别人审
  - 我不审让别人审
  - 代审
  - 转办
related_tools: []
related_pages: [application]
prerequisites:
  - 应用市场已安装 approve 插件
  - 我是当前待办审批人
negative:
  - 转交是把这一步换人审，不是加人；原来的你不再是该步审批人
  - 转交只影响当前节点，后续节点的审批人不变
last_verified: v1.7.90
---

# 转交审批给他人

## 是什么
转交是当你是当前审批人、但希望由别人来审这一步时，把待办交给另一个人。转交后由对方来批准 / 拒绝，你这一步算处理完毕。

## 操作步骤
1. 打开待你处理的审批单详情
2. 在操作区点「转交」
3. 选择要转交给的那个人（单选一人）
4. 确认提交

## 转交后会怎样
- 这一步的审批人变成你选的那个人，对方进入「待处理」并收到通知
- 你在这一步显示为已处理（备注里记录转交给了谁）
- 后续节点照原模板继续走，不受影响

## 转交 vs 加签
- **转交**：换人——这一步不再需要你，改由对方审
- **加签**：加人——你和新拉进来的人一起审这一步，详见 [[approve.addsign.howto]]

## 相关
- 处理待办：[[approve.todo.howto]]
- 加签：[[approve.addsign.howto]]
- 流程节点：[[approve.node.concept]]
